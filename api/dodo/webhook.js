// =====================================================
// FILE: /api/dodo/webhook.js
// Dodo Payments Webhook Handler for Vercel
// =====================================================
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Initialize Supabase with SERVICE ROLE key
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Step 1: Verify webhook signature
    const signature = req.headers['dodo-signature'] || req.headers['webhook-signature'];
    const payload = JSON.stringify(req.body);
    
    const isValid = verifyWebhookSignature(
      payload,
      signature,
      process.env.DODO_WEBHOOK_SECRET
    );

    if (!isValid) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log('✅ Webhook signature verified');

    // Step 2: Acknowledge receipt immediately
    res.status(200).json({ received: true });

    // Step 3: Process webhook asynchronously
    processWebhookAsync(req.body).catch(console.error);

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return res.status(400).json({ error: 'Webhook processing failed' });
  }
}

// Verify webhook signature
function verifyWebhookSignature(payload, signature, secret) {
  try {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');
    return digest === signature;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// Process webhook events asynchronously
async function processWebhookAsync(data) {
  try {
    const eventType = data.type;
    console.log('📥 Processing webhook event:', eventType);

    switch (eventType) {
      case 'checkout.session.completed':
      case 'payment.succeeded':
        await handlePaymentSuccess(data);
        break;
      
      case 'payment.failed':
        await handlePaymentFailed(data);
        break;
      
      case 'subscription.created':
        await handleSubscriptionCreated(data);
        break;
      
      case 'subscription.cancelled':
        await handleSubscriptionCancelled(data);
        break;
      
      default:
        console.log('⚠️ Unhandled event type:', eventType);
    }
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
  }
}

// Handle successful payment
async function handlePaymentSuccess(data) {
  const session = data.data;
  const sessionId = session.id;
  const customerEmail = session.customer_email;
  const amount = session.amount_total / 100; // Convert from cents
  const planType = session.metadata?.plan_type || 'starter';
  const billingCycle = session.metadata?.billing_cycle || 'monthly';

  console.log('💳 Processing payment for:', customerEmail);

  // Find user by email
  const { data: user, error: userError } = await supabase
    .from('user_profiles')
    .select('user_id')
    .eq('email', customerEmail)
    .single();

  if (userError || !user) {
    console.error('❌ User not found:', customerEmail);
    return;
  }

  // Insert verified payment record
  const { error: paymentError } = await supabase
    .from('payment_records')
    .insert({
      payment_id: sessionId,
      user_id: user.user_id,
      plan_type: planType,
      amount: amount,
      billing_cycle: billingCycle,
      status: 'completed',
      verified_at: new Date().toISOString(),
    });

  if (paymentError) {
    console.error('❌ Error inserting payment:', paymentError);
    return;
  }

  // Also insert into payments table for tracking
  await supabase.from('payments').insert({
    user_id: user.user_id,
    customer_email: customerEmail,
    transaction_id: sessionId,
    plan_type: planType,
    amount: amount,
    billing_cycle: billingCycle,
    status: 'completed',
    dodo_session_id: sessionId,
    metadata: session.metadata,
    completed_at: new Date().toISOString(),
  });

  // Activate user plan
  await activateUserPlan(user.user_id, planType, billingCycle, amount);
  
  console.log('✅ Payment verified and plan activated:', user.user_id);
}

// Handle failed payment
async function handlePaymentFailed(data) {
  const payment = data.data;
  console.log('❌ Payment failed:', payment.id);
  
  await supabase
    .from('payments')
    .update({ status: 'failed' })
    .eq('dodo_session_id', payment.id);
}

// Handle subscription created
async function handleSubscriptionCreated(data) {
  console.log('🔄 Subscription created:', data.data.id);
  // Handle recurring subscription logic here
}

// Handle subscription cancelled
async function handleSubscriptionCancelled(data) {
  const subscription = data.data;
  console.log('🚫 Subscription cancelled:', subscription.id);
  
  const { data: payment } = await supabase
    .from('payment_records')
    .select('user_id')
    .eq('payment_id', subscription.id)
    .single();
  
  if (payment) {
    await supabase
      .from('user_plans')
      .update({
        plan_type: 'free',
        credits_remaining: 10,
        posts_per_month: 10,
        status: 'inactive',
        expires_at: new Date().toISOString(),
      })
      .eq('user_id', payment.user_id);
  }
}

// Activate user plan
async function activateUserPlan(userId, planType, billingCycle, amount) {
  const planLimits = {
    starter: { posts: 50, credits: 50 },
    professional: { posts: 200, credits: 200 },
    enterprise: { posts: 1000, credits: 1000 },
  };

  const limits = planLimits[planType] || { posts: 10, credits: 10 };
  
  const expiresAt = new Date();
  if (billingCycle === 'yearly') {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }

  const { error } = await supabase
    .from('user_plans')
    .upsert({
      user_id: userId,
      plan_type: planType,
      posts_per_month: limits.posts,
      credits_remaining: limits.credits,
      billing_cycle: billingCycle,
      status: 'active',
      amount: amount,
      activated_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id'
    });

  if (error) {
    console.error('❌ Error activating plan:', error);
  } else {
    console.log('✅ Plan activated successfully');
  }
}
