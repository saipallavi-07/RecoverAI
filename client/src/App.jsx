import { useState } from "react";

function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [batchResult, setBatchResult] = useState(null);
const [batchLoading, setBatchLoading] = useState(false);
const [recoveredAmount, setRecoveredAmount] = useState(0);
const totalAtRisk = batchResult ? batchResult.totalAtRisk : 0;
const activeCases = batchResult?.results
  ? batchResult.results.filter((item) => item.action !== "STOP").length
  : 0;
  const aiActions = batchResult ? batchResult.results.length : 0;


  async function executeRecovery() {
  setLoading(true);
  setResult(null);

  try {
    // 1. Ask our backend to create a recovery order
    const response = await fetch("http://localhost:5000/api/recovery/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "RETRY",
  amount: 2499,
  attempts: 0,
  suspicious: false,
  customer: "Priya",
}),
    });

    const data = await response.json();

    if (!data.success || !data.order) {
      setResult(data);
      return;
    }

    // 2. Open Razorpay Checkout
    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: data.order.amount,
      currency: data.order.currency,
      name: "RecoverAI",
      description: "Revenue Recovery Payment",
      order_id: data.order.id,

      handler: async function (paymentResponse) {
  try {
    const verifyResponse = await fetch(
      "http://localhost:5000/api/payment/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paymentResponse),
      }
    );

    const verifyData = await verifyResponse.json();

    if (verifyData.verified) {
      console.log("VERIFY DATA:", verifyData);
      setRecoveredAmount((prev) => prev + Number(verifyData.amount || 0));
      setResult({
        success: true,
        verified: true,
        message: "Payment verified successfully.",
        paymentId: verifyData.paymentId,
        orderId: verifyData.orderId,
      });
    } else {
      setResult({
        success: false,
        verified: false,
        message: "Payment could not be verified.",
      });
    }
  } catch (error) {
    setResult({
      success: false,
      verified: false,
      message: "Could not verify payment with RecoverAI.",
    });
  }
},

      modal: {
        ondismiss: function () {
          setResult({
            success: false,
            message: "Payment window was closed.",
          });
        },
      },
    };

    const razorpay = new window.Razorpay(options);
    razorpay.open();
  } catch (error) {
    setResult({
      success: false,
      message: "Could not connect to RecoverAI backend.",
    });
  } finally {
    setLoading(false);
  }
}
  async function runRecoveryBatch() {
  setBatchLoading(true);
  setBatchResult(null);

  try {
    const response = await fetch("http://localhost:5000/api/recovery/batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();
    setBatchResult(data);
  } catch (error) {
    setBatchResult({
      success: false,
      message: "Could not connect to RecoverAI backend.",
    });
  } finally {
    setBatchLoading(false);
  }
}
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold">RecoverAI</h1>
            <p className="text-sm text-slate-400">
              Autonomous Revenue Recovery
            </p>
          </div>

          <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
            ● AI Agent Active
          </div>
        </div>
      </header>

      {/* Dashboard */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h2 className="mb-6 text-xl font-semibold">
          Revenue Recovery Dashboard
        </h2>

        {/* Metrics */}
        <div className="grid gap-5 md:grid-cols-4">
          <Metric 
  title="Revenue at Risk" 
  value={`₹${(totalAtRisk / 100).toLocaleString("en-IN")}`} 
  subtitle={batchResult ? `${batchResult.totalCases} customers` : "Run batch to calculate"} 
/>

          <Metric
  title="Revenue Recovered"
  value={`₹${(recoveredAmount / 100).toLocaleString("en-IN")}`}
  subtitle={
  totalAtRisk > 0
    ? `${((recoveredAmount / totalAtRisk) * 100).toFixed(1)}% recovery rate`
    : "Awaiting confirmed payment"
}
/>

          <Metric 
            title="Active Cases" 
            value={activeCases} 
            subtitle={batchResult ? "Recovery actions available" : "Run batch to calculate"} 
          />

          <Metric
  title="AI Actions"
  value={batchResult ? batchResult.results.length : 0}
  subtitle={
    batchResult ? "Cases analyzed by AI" : "Run batch to calculate"
  }
/>
        </div>
        {/* AI Decision Summary */}
<section className="mt-8 rounded-2xl border border-emerald-500/20 bg-slate-900 p-6">
  <h3 className="text-lg font-semibold">AI Decision Summary</h3>
  <p className="mt-1 text-sm text-slate-400">
    RecoverAI analyzes each case and applies safety-first recovery actions.
  </p>

  <div className="mt-5 grid gap-4 md:grid-cols-3">
    <div className="rounded-xl bg-slate-950 p-4">
      <p className="text-sm text-slate-400">Retry</p>
      <p className="mt-1 text-2xl font-bold text-emerald-400">Bounded</p>
      <p className="mt-1 text-xs text-slate-500">
        Used when payment failure is recoverable.
      </p>
    </div>

    <div className="rounded-xl bg-slate-950 p-4">
      <p className="text-sm text-slate-400">Payment Link</p>
      <p className="mt-1 text-2xl font-bold">Fresh Link</p>
      <p className="mt-1 text-xs text-slate-500">
        Used when checkout was abandoned.
      </p>
    </div>

    <div className="rounded-xl bg-slate-950 p-4">
      <p className="text-sm text-slate-400">Safety Guardrail</p>
      <p className="mt-1 text-2xl font-bold text-red-400">STOP</p>
      <p className="mt-1 text-xs text-slate-500">
        Stops repeated or suspicious cases.
      </p>
    </div>
  </div>
</section>
{/* Recovery Impact */}
<section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
  <h3 className="text-lg font-semibold">Recovery Impact</h3>
  <p className="mt-1 text-sm text-slate-400">
    Live revenue impact from RecoverAI recovery actions.
  </p>

  <div className="mt-5 grid gap-4 md:grid-cols-3">
    <div className="rounded-xl bg-slate-950 p-4">
      <p className="text-sm text-slate-400">Revenue at Risk</p>
      <p className="mt-2 text-2xl font-bold">
        ₹{(totalAtRisk / 100).toLocaleString("en-IN")}
      </p>
    </div>

    <div className="rounded-xl bg-slate-950 p-4">
      <p className="text-sm text-slate-400">Recovered</p>
      <p className="mt-2 text-2xl font-bold text-emerald-400">
        ₹{(recoveredAmount / 100).toLocaleString("en-IN")}
      </p>
    </div>

    <div className="rounded-xl bg-slate-950 p-4">
      <p className="text-sm text-slate-400">Recovery Rate</p>
      <p className="mt-2 text-2xl font-bold">
        {totalAtRisk > 0
          ? `${((recoveredAmount / totalAtRisk) * 100).toFixed(1)}%`
          : "0.0%"}
      </p>
    </div>
  </div>
</section>

        {/* Recovery Queue */}
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold">AI Recovery Queue</h3>
            <p className="text-sm text-slate-400">
              Cases currently being analyzed by RecoverAI
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-slate-800 text-sm text-slate-400">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Problem</th>
                  <th className="px-4 py-3">AI Action</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>

              <tbody>
  {batchResult ? (
    batchResult.results.map((item) => (
      <RecoveryRow
        key={item.customer}
        customer={item.customer}
        amount={`₹${(item.amount / 100).toLocaleString("en-IN")}`}
        problem={
          item.reason === "checkout_abandoned"
            ? "Checkout abandoned"
            : item.attempts >= 3
            ? "3 failed attempts"
            : "Payment failed"
        }
        action={item.action}
        status={item.status}
      />
    ))
  ) : (
    <tr>
      <td colSpan="5" className="px-4 py-6 text-center text-slate-500">
        Run Recovery Batch to analyze cases
      </td>
    </tr>
  )}
</tbody>
            </table>
          </div>
          <div className="mt-6 border-t border-slate-800 pt-6">
  <button
    onClick={executeRecovery}
    disabled={loading}
    className="rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {loading ? "Executing Recovery..." : "Execute Recovery"}
  </button>
  <div className="mt-4">
  <button
    onClick={runRecoveryBatch}
    disabled={batchLoading}
    className="rounded-xl border border-slate-700 px-5 py-3 font-semibold hover:bg-slate-800 disabled:opacity-50"
  >
    {batchLoading ? "Analyzing Batch..." : "Run Recovery Batch"}
  </button>

  {batchResult && (
    <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4">
      <p className="font-semibold">Batch Analysis Complete</p>
      <p className="mt-2 text-sm text-slate-400">
        Cases analyzed: {batchResult.totalCases}
      </p>
      <p className="text-sm text-slate-400">
        Revenue at risk: ₹{(batchResult.totalAtRisk / 100).toLocaleString("en-IN")}
      </p>
      <p className="text-sm text-emerald-400">
        Recovery candidates: {batchResult.recoveryCandidates}
      </p>
    </div>
  )}
</div>

  {result && (
    <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4">
      <p className="font-semibold">
        {result.success ? "✓ Recovery Executed" : "Recovery Blocked"}
      </p>
      <p className="mt-1 text-sm text-slate-400">
        {result.message}
      </p>

      {result.paymentLink && (
  <div className="mt-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
    <p className="text-sm font-semibold text-yellow-400">
      Recovery Payment Link Generated
    </p>
    <p className="mt-1 text-xs text-slate-400">
      RecoverAI selected a fresh payment link after checkout abandonment.
    </p>
  </div>
)}

    </div>
  )}
</div>
        </section>
                {/* Audit Trail */}
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-lg font-semibold">Audit Trail</h3>
          <p className="mt-1 text-sm text-slate-400">
            Explainable record of RecoverAI decisions and actions.
          </p>

          <div className="mt-5 space-y-3">
            <div className="rounded-xl bg-slate-950 p-4">
              <p className="text-sm font-semibold">AI Decision</p>
              <p className="mt-1 text-sm text-slate-400">
                Recovery cases analyzed and safest actions selected.
              </p>
            </div>

            <div className="rounded-xl bg-slate-950 p-4">
              <p className="text-sm font-semibold">Safety Check</p>
              <p className="mt-1 text-sm text-slate-400">
                Maximum attempts and suspicious-payment guardrails evaluated.
              </p>
            </div>

            <div className="rounded-xl bg-slate-950 p-4">
              <p className="text-sm font-semibold">Payment Verification</p>
              <p className="mt-1 text-sm text-slate-400">
                Razorpay payment signature verified server-side before revenue was counted.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Metric({ title, value, subtitle }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function RecoveryRow({ customer, amount, problem, action, status }) {
  return (
    <tr className="border-b border-slate-800 last:border-0">
      <td className="px-4 py-4 font-medium">{customer}</td>
      <td className="px-4 py-4">{amount}</td>
      <td className="px-4 py-4 text-slate-400">{problem}</td>
      <td className="px-4 py-4">{action}</td>
      <td className="px-4 py-4">
  <span
  className={`rounded-full px-3 py-1 text-xs font-semibold ${
    action === "STOP"
      ? "bg-red-500/10 text-red-400"
      : action === "PAYMENT_LINK"
      ? "bg-yellow-500/10 text-yellow-400"
      : "bg-emerald-500/10 text-emerald-400"
  }`}
>
  {status}
</span>

  <p className="mt-2 text-xs text-slate-500">
  {action === "STOP"
    ? "AI decision: stop recovery after repeated failures."
    : action === "PAYMENT_LINK"
    ? "AI decision: send a fresh payment link after checkout abandonment."
    : "AI decision: retry payment within recovery limits."}
</p>
</td>
    </tr>
  );
}

export default App;