// =====================================================
// FILE: api/payment/verify.js
// Backend verification endpoint
// =====================================================
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { sessionId, userId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    console.log('🔍 Verifying payment:', sessionId);

    // Check if payment already verified in our database
    const { data: existingPayment, error: checkError } = await supabase
      .from('payment_records')
      .select('*')
      .eq('payment_id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (existingPayment) {
      console.log('✅ Payment already verified');
      return res.status(200).json({
        success: true,
        message: 'Payment already verified',
        verified: true,
      });
    }

    // Verify with Dodo API
    const dodoResponse = await fetch(
      `https://api.dodopayments.com/v1/checkout/sessions/${sessionId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.DODO_API_KEY}`,
        },
      }
    );

    if (!dodoResponse.ok) {
      throw new Error('Dodo API verification failed');
    }

    const dodoData = await dodoResponse.json();

    if (dodoData.payment_status !== 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Payment not completed',
      });
    }

    console.log('✅ Dodo confirmed payment');

    // Activate plan (webhook might have already done this, but double-check)
    const metadata = dodoData.metadata || {};
    const planType = metadata.planType || 'starter';
    const billingCycle = metadata.billingCycle || 'monthly';

    // Insert payment record if not exists
    await supabase.from('payment_records').upsert({
      payment_id: sessionId,
      user_id: user.id,
      plan_type: planType,
      amount: dodoData.amount_total / 100,
      billing_cycle: billingCycle,
      status: 'completed',
      verified_at: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      verified: true,
    });

  } catch (error) {
    console.error('❌ Verification error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
