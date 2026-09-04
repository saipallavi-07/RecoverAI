const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const Razorpay = require("razorpay");
const crypto = require("crypto");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "RecoverAI backend is running",
    razorpay: process.env.RAZORPAY_KEY_ID ? "configured" : "missing",
  });
});

app.post("/api/create-order", async (req, res) => {
  try {
    const amount = Number(req.body.amount);

    if (!amount || amount < 100) {
      return res.status(400).json({
        error: "Amount must be at least ₹1",
      });
    }

    const order = await razorpay.orders.create({
      amount: amount,
      currency: "INR",
      receipt: `recoverai_${Date.now()}`,
      notes: {
        source: "RecoverAI",
        action: "recovery",
      },
    });

    res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Order creation failed:", error);

    res.status(500).json({
      success: false,
      error: "Could not create Razorpay order",
    });
  }
});
app.post("/api/recovery/decide", (req, res) => {
  const {
    amount,
    attempts = 0,
    reason = "payment_failed",
    suspicious = false,
  } = req.body;

  let action;
  let explanation;

  // Safety first
  if (suspicious) {
    action = "STOP";
    explanation = "Payment looks suspicious, so recovery is stopped.";
  } else if (attempts >= 3) {
    action = "STOP";
    explanation = "Maximum recovery attempts reached.";
  } else if (reason === "checkout_abandoned") {
    action = "PAYMENT_LINK";
    explanation = "Customer abandoned checkout, so send a fresh payment link.";
  } else {
    action = "RETRY";
    explanation = "Payment failed without a suspicious signal, so a bounded retry is appropriate.";
  }

 res.json({
  success: true,
  decision: {
    action,
    amount,
    explanation,
    guardrail: attempts < 3 && !suspicious,
    attempts,
    riskLevel: suspicious ? "HIGH" : attempts >= 2 ? "MEDIUM" : "LOW",
  },
});
});
app.post("/api/recovery/execute", async (req, res) => {
  try {
    const {
      action,
      amount,
      attempts = 0,
      suspicious = false,
    } = req.body;

    // Never execute unsafe recovery actions
    if (action === "STOP") {
      return res.json({
        success: false,
        executed: false,
        message: "Recovery stopped by safety guardrail.",
      });
    }

    if (suspicious) {
      return res.json({
        success: false,
        executed: false,
        message: "Recovery blocked because the payment is suspicious.",
      });
    }

    if (attempts >= 3) {
      return res.json({
        success: false,
        executed: false,
        message: "Recovery blocked because the maximum attempts were reached.",
      });
    }

    // For RETRY, create a fresh Razorpay order.
    if (action === "RETRY") {
      const order = await razorpay.orders.create({
        amount: Number(amount),
        currency: "INR",
        receipt: `recovery_${Date.now()}`,
        notes: {
          source: "RecoverAI",
          action: "retry",
        },
      });

      return res.json({
        success: true,
        executed: true,
        action: "RETRY",
        message: "Fresh recovery order created.",
        order,
      });
    }

    // PAYMENT_LINK will be implemented after we verify
    // the current Razorpay Payment Links API.
   if (action === "PAYMENT_LINK") {
    return res.json({
  success: true,
  executed: true,
  action: "PAYMENT_LINK",
  message: "Recovery payment link generated for the customer.",
  paymentLink: "https://rzp.io/demo/recoverai",
  simulated: true,
  });

  const paymentLink = await response.json();

  if (!response.ok) {
    console.error("Razorpay Payment Link error:", paymentLink);
    throw new Error(
      paymentLink?.error?.description || "Payment Link creation failed"
    );
  }

  return res.json({
  success: true,
  executed: true,
  action: "PAYMENT_LINK",
  message: "Recovery payment link generated for the customer.",
  paymentLink: "https://rzp.io/demo/recoverai",
  simulated: true,
});
}
  
    return res.status(400).json({
      success: false,
      message: "Unknown recovery action.",
    });
  } catch (error) {
    console.error("Recovery execution failed:", error);

    res.status(500).json({
  success: false,
  executed: false,
  message:
    error.response?.data?.error?.description ||
    error.response?.data?.error?.code ||
    error.message ||
    "Recovery execution failed safely.",
});
  }
});
app.post("/api/recovery/payment-link", async (req, res) => {
  try {
    const amount = Number(req.body.amount);

    if (!amount || amount < 100) {
      return res.status(400).json({
        success: false,
        message: "Amount must be at least ₹1",
      });
    }

    const paymentLink = await razorpay.paymentLink.create({
      amount: amount,
      currency: "INR",
      description: "RecoverAI payment recovery",
      customer: {
        name: req.body.customer || "Customer",
      },
      notes: {
        source: "RecoverAI",
        action: "payment_link_recovery",
      },
    });

    res.json({
      success: true,
      action: "PAYMENT_LINK",
      message: "Recovery payment link created.",
      paymentLink: paymentLink.short_url,
      paymentLinkId: paymentLink.id,
    });
  } catch (error) {
    console.error("Payment link creation failed:", error);

    res.status(500).json({
      success: false,
      message: "Payment link recovery failed safely.",
    });
  }
});
app.post("/api/recovery/batch", async (req, res) => {
  const cases = [
    { customer: "Rahul", amount: 4999, reason: "payment_failed", attempts: 0 },
    { customer: "Priya", amount: 2499, reason: "checkout_abandoned", attempts: 0 },
    { customer: "Arjun", amount: 8999, reason: "payment_failed", attempts: 3 },
    { customer: "Sneha", amount: 6499, reason: "payment_failed", attempts: 0 },
    { customer: "Vikram", amount: 3999, reason: "payment_failed", attempts: 1 },
  ];

  const results = cases.map((item) => {
    let action;

    if (item.attempts >= 3) {
      action = "STOP";
    } else if (item.reason === "checkout_abandoned") {
      action = "PAYMENT_LINK";
    } else {
      action = "RETRY";
    }

    return {
      ...item,
      action,
      status: action === "STOP" ? "Stopped" : "Ready",
    };
  });

  const totalAtRisk = results.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const recoveryCandidates = results.filter(
    (item) => item.action === "RETRY"
  );

  res.json({
    success: true,
    totalCases: results.length,
    totalAtRisk,
    recoveryCandidates: recoveryCandidates.length,
    results,
  });
});
app.post("/api/payment/verify",async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: "Payment verification failed.",
      });
    }

    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    console.log("Verified payment:", payment);
    const order = await razorpay.orders.fetch(razorpay_order_id);

    res.json({
      success: true,
      verified: true,
      message: "Payment verified successfully.",
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      amount: order.amount,
      
    });
  } catch (error) {
    console.error(
  "Payment link creation failed:",
  error.response?.data || error.message || error
);

    res.status(500).json({
      success: false,
      verified: false,
      message: "Payment verification failed safely.",
    });
  }
});
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`RecoverAI backend running on http://localhost:${PORT}`);
});