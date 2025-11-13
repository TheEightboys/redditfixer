// =====================================================
// FILE: api/dodo/webhook.js
// FIXED: Enhanced logging and error handling
// =====================================================
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

let supabase = null;

function getSupabaseClient() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    // Accept either SUPABASE_SERVICE_ROLE_KEY (recommended for server-side) or
    // SUPABASE_SERVICE_KEY to be compatible with the rest of the app and different env setups.
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    
    if (!url || !key) {
      console.error('❌ Supabase credentials missing!');
      throw new Error('Supabase environment variables not set');
    }
    
    console.log('✅ Supabase client initialized');
    supabase = createClient(url, key);
  }
  return supabase;
}

// Verify webhook signature
function verifySignature(payload, signature, secret) {
  try {
    if (!secret) {
      console.error('❌ DODO_WEBHOOK_SECRET is not set!');
      console.error('   Set this in your Render environment variables');
      return false;
    }
    
    console.log('🔐 Verifying signature...');
    console.log('   Signature received:', signature ? signature.substring(0, 20) + '...' : 'NONE');
    
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');
    
    const isValid = digest === signature;
    console.log(isValid ? '✅ Signature valid' : '❌ Signature invalid');
    
    return isValid;
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
}

// Process webhook events
async function processWebhook(data) {
  try {
    const eventType = data.type;
    console.log('🔄 Processing event type:', eventType);
    console.log('📦 Full event data:', JSON.stringify(data, null, 2));

    if (eventType === 'checkout.session.completed' || eventType === 'payment.succeeded') {
      await handlePaymentSuccess(data);
    } else {
      console.log('ℹ️ Ignoring event type:', eventType);
    }
  } catch (error) {
    console.error('❌ processWebhook error:', error);
  }
}

// Handle successful payment
async function handlePaymentSuccess(data) {
  try {
    console.log('\n🎉 ========== PAYMENT SUCCESS ==========');
    
    const supabase = getSupabaseClient();
    const session = data.data || data;
    const metadata = session.metadata || {};
    
    console.log('💳 Session ID:', session.id);
    console.log('📧 Customer Email:', session.customer_email);
    console.log('📝 Metadata:', JSON.stringify(metadata, null, 2));
    console.log('💰 Amount:', session.amount_total);
    
    if (!metadata.userId) {
      console.error('❌ CRITICAL: No userId in metadata!');
      console.error('   Metadata received:', metadata);
      return;
    }

    const userId = metadata.userId;
    const planType = metadata.planType || 'starter';
    const billingCycle = metadata.billingCycle || 'monthly';
    const amount = (session.amount_total || 0) / 100;

    console.log('👤 User ID:', userId);
    console.log('📦 Plan:', planType);
    console.log('💵 Amount:', amount);
    console.log('📅 Billing:', billingCycle);

    // Step 1: Insert payment record
    console.log('\n📝 Step 1: Inserting payment record...');
    const { data: paymentRecord, error: paymentError } = await supabase
      .from('payment_records')
      .insert({
        payment_id: session.id,
        user_id: userId,
        plan_type: planType,
        amount: amount,
        billing_cycle: billingCycle,
        status: 'completed',
        verified_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (paymentError) {
      console.error('❌ Payment record error:', paymentError);
      // Continue anyway - maybe it already exists
    } else {
      console.log('✅ Payment record inserted:', paymentRecord?.id);
    }

    // Step 2: Insert into payments table
    console.log('\n📝 Step 2: Inserting into payments table...');
    const { data: paymentEntry, error: paymentsError } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        customer_email: session.customer_email || metadata.email,
        transaction_id: session.id,
        plan_type: planType,
        amount: amount,
        billing_cycle: billingCycle,
        status: 'completed',
        dodo_session_id: session.id,
        metadata: metadata,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (paymentsError) {
      console.error('❌ Payments insert error:', paymentsError);
    } else {
      console.log('✅ Payment entry created:', paymentEntry?.id);
    }

    // Step 3: Activate plan
    console.log('\n🚀 Step 3: Activating plan...');
    const planLimits = {
      starter: 150,
      professional: 250,
      enterprise: 300,
    };

    const credits = planLimits[planType] || 150;
    const expiresAt = new Date();
    
    if (billingCycle === 'yearly') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    console.log('   Credits:', credits);
    console.log('   Expires:', expiresAt.toISOString());

    const { data: planData, error: planError } = await supabase
      .from('user_plans')
      .upsert({
        user_id: userId,
        plan_type: planType,
        posts_per_month: credits,
        credits_remaining: credits,
        billing_cycle: billingCycle,
        status: 'active',
        amount: amount,
        activated_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (planError) {
      console.error('❌ Plan activation error:', planError);
      console.error('   Error details:', JSON.stringify(planError, null, 2));
    } else {
      console.log('✅ PLAN ACTIVATED SUCCESSFULLY!');
      console.log('   Plan data:', JSON.stringify(planData, null, 2));
    }

    console.log('\n========== PAYMENT PROCESSING COMPLETE ==========\n');

  } catch (error) {
    console.error('❌ Payment handling error:', error);
    console.error('   Stack trace:', error.stack);
  }
}

// Main webhook handler
async function handler(req, res) {
  const timestamp = new Date().toISOString();
  
  console.log('\n\n');
  console.log('='.repeat(60));
  console.log('📥 WEBHOOK RECEIVED FROM DODO');
  console.log('   Time:', timestamp);
  console.log('   Method:', req.method);
  console.log('   URL:', req.url);
  console.log('='.repeat(60));

  if (req.method !== 'POST') {
    console.log('❌ Invalid method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Log headers
    console.log('\n📋 Headers:');
    Object.keys(req.headers).forEach(key => {
      if (key.toLowerCase().includes('dodo') || key.toLowerCase().includes('signature')) {
        console.log(`   ${key}: ${req.headers[key]}`);
      }
    });

    // Get signature
    const signature = req.headers['dodo-signature'] || 
                     req.headers['webhook-signature'] ||
                     req.headers['x-dodo-signature'];
    
    console.log('\n🔐 Signature check:');
    console.log('   Found signature:', !!signature);
    console.log('   Webhook secret set:', !!process.env.DODO_WEBHOOK_SECRET);
    
    const payload = JSON.stringify(req.body);
    console.log('\n📦 Payload size:', payload.length, 'bytes');
    
    // Verify signature (if secret is set)
    if (process.env.DODO_WEBHOOK_SECRET) {
      if (!signature) {
        console.error('❌ No signature in request headers');
        return res.status(401).json({ error: 'Missing signature' });
      }
      
      if (!verifySignature(payload, signature, process.env.DODO_WEBHOOK_SECRET)) {
        console.error('❌ Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      console.log('✅ Signature verified');
    } else {
      console.warn('⚠️ WARNING: DODO_WEBHOOK_SECRET not set - skipping signature verification');
      console.warn('   This is insecure! Set DODO_WEBHOOK_SECRET in production');
    }

    // Acknowledge immediately
    console.log('✅ Sending 200 OK response to Dodo');
    res.status(200).json({ received: true, timestamp });

    // Process async
    console.log('🔄 Starting async processing...');
    processWebhook(req.body).catch(err => {
      console.error('❌ Async webhook processing error:', err);
      console.error('   Stack:', err.stack);
    });

  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    console.error('   Stack:', error.stack);
    return res.status(400).json({ error: 'Webhook failed', details: error.message });
  }
}

module.exports = handler;