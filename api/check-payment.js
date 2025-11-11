// =====================================================
// FILE: /api/check-payment.js
// Check user payment status
// =====================================================
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }

  try {
    // Get verified payment records
    const { data: payments, error: paymentsError } = await supabase
      .from('payment_records')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (paymentsError) throw paymentsError;

    // Get current plan
    const { data: plan, error: planError } = await supabase
      .from('user_plans')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (planError) throw planError;

    return res.status(200).json({
      success: true,
      plan: plan,
      payments: payments,
      isVerified: payments.length > 0,
      hasActivePlan: plan.plan_type !== 'free',
    });

  } catch (error) {
    console.error('Error checking payment:', error);
    return res.status(500).json({ 
      error: 'Failed to check payment status',
      details: error.message 
    });
  }
}
