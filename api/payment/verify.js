// =====================================================
// FILE: api/payment/verify.js
// IMPROVED: Better error handling and logging
// =====================================================
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  console.log('\n🔍 ========== PAYMENT VERIFICATION REQUEST ==========');
  console.log('   Time:', new Date().toISOString());
  console.log('   Method:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.error('❌ No authorization header');
      return res.status(401).json({ error: 'No authorization' });
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('🔐 Verifying user token...');
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('❌ Auth failed:', authError?.message);
      return res.status(401).json({ error: 'Invalid token' });
    }

    console.log('✅ User authenticated:', user.email);

    const { sessionId, userId } = req.body;

    if (!sessionId) {
      console.error('❌ No session ID provided');
      return res.status(400).json({ error: 'Session ID required' });
    }

    console.log('💳 Session ID:', sessionId);
    console.log('👤 User ID:', user.id);

    // Check if payment already verified in database
    console.log('\n📊 Checking existing payment records...');
    const { data: existingPayment, error: checkError } = await supabase
      .from('payment_records')
      .select('*')
      .eq('payment_id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (existingPayment) {
      console.log('✅ Payment already verified in database');
      console.log('   Plan:', existingPayment.plan_type);
      console.log('   Amount:', existingPayment.amount);
      
      // Check if plan is activated
      const { data: userPlan } = await supabase
        .from('user_plans')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      console.log('📦 Current plan status:', userPlan?.status);
      console.log('   Plan type:', userPlan?.plan_type);
      console.log('   Credits:', userPlan?.credits_remaining);
      
      return res.status(200).json({
        success: true,
        message: 'Payment already verified',
        verified: true,
        plan: userPlan,
      });
    }

    console.log('⚠️ Payment not found in database - verifying with Dodo...');

    // Verify with Dodo API
    if (!process.env.DODO_API_KEY) {
      console.error('❌ DODO_API_KEY not set!');
      return res.status(500).json({
        success: false,
        error: 'Payment verification unavailable',
      });
    }

    console.log('🔄 Fetching from Dodo API...');
    const dodoResponse = await fetch(
      `https://api.dodopayments.com/v1/checkout/sessions/${sessionId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.DODO_API_KEY}`,
        },
      }
    );

    if (!dodoResponse.ok) {
      const errorText = await dodoResponse.text();
      console.error('❌ Dodo API error:', dodoResponse.status, errorText);
      throw new Error(`Dodo API error: ${dodoResponse.status}`);
    }

    const dodoData = await dodoResponse.json();
    console.log('📦 Dodo response:', JSON.stringify(dodoData, null, 2));

    if (dodoData.payment_status !== 'paid') {
      console.error('❌ Payment not completed. Status:', dodoData.payment_status);
      return res.status(400).json({
        success: false,
        error: 'Payment not completed',
        status: dodoData.payment_status,
      });
    }

    console.log('✅ Dodo confirmed payment is paid');

    // Extract plan details from metadata
    const metadata = dodoData.metadata || {};
    const planType = metadata.planType || 'starter';
    const billingCycle = metadata.billingCycle || 'monthly';
    const amount = (dodoData.amount_total || 0) / 100;

    console.log('\n📝 Activating plan...');
    console.log('   Plan type:', planType);
    console.log('   Billing:', billingCycle);
    console.log('   Amount:', amount);

    // Insert payment record
    console.log('💾 Inserting payment record...');
    const { data: newPayment, error: paymentInsertError } = await supabase
      .from('payment_records')
      .insert({
        payment_id: sessionId,
        user_id: user.id,
        plan_type: planType,
        amount: amount,
        billing_cycle: billingCycle,
        status: 'completed',
        verified_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (paymentInsertError) {
      console.error('❌ Payment record insert error:', paymentInsertError);
    } else {
      console.log('✅ Payment record created:', newPayment?.id);
    }

    // Activate plan
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

    console.log('🚀 Upserting user plan...');
    const { data: activatedPlan, error: planError } = await supabase
      .from('user_plans')
      .upsert({
        user_id: user.id,
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
      console.error('   Details:', JSON.stringify(planError, null, 2));
      throw planError;
    }

    console.log('✅ PLAN ACTIVATED SUCCESSFULLY!');
    console.log('   Plan data:', JSON.stringify(activatedPlan, null, 2));
    console.log('========== VERIFICATION COMPLETE ==========\n');

    return res.status(200).json({
      success: true,
      message: 'Payment verified and plan activated',
      verified: true,
      plan: activatedPlan,
    });

  } catch (error) {
    console.error('❌ Verification error:', error);
    console.error('   Stack:', error.stack);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

module.exports = handler;