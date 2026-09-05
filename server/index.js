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
 app.post("/api/recovery/decide", async (req, res) => {
  try {
    const {
      amount,
      attempts = 0,
      reason = "payment_failed",
      suspicious = false,
      customer = "Customer",
    } = req.body;

    // Deterministic safety guardrails always win
    if (suspicious) {
      return res.json({
        success: true,
        decision: {
          action: "STOP",
          amount,
          explanation: "Safety guardrail blocked recovery because the payment looks suspicious.",
          guardrail: true,
          attempts,
          riskLevel: "HIGH",
          aiPowered: true,
        },
      });
    }

    if (attempts >= 3) {
      return res.json({
        success: true,
        decision: {
          action: "STOP",
          amount,
          explanation: "Safety guardrail blocked recovery because the maximum number of attempts was reached.",
          guardrail: true,
          attempts,
          riskLevel: "HIGH",
          aiPowered: true,
        },
      });
    }

    const prompt = `
You are RecoverAI, an AI payment-recovery agent.

Analyze this failed payment case and choose the safest recovery strategy.

Customer: ${customer}
Amount: ${amount}
Reason: ${reason}
Previous attempts: ${attempts}
Suspicious: ${suspicious}

Allowed actions:
- RETRY: retry the payment when it is a normal payment failure.
- PAYMENT_LINK: use when checkout was abandoned or the customer needs another payment route.
- STOP: use when recovery should not continue.

Return ONLY valid JSON:
{
  "action": "RETRY",
  "explanation": "short explanation",
  "riskLevel": "LOW"
}
`;

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [
            {
              role: "system",
              content:
                "You are a careful payment recovery decision engine. Return JSON only.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.6,
          max_completion_tokens: 1024,
          reasoning_effort: "low",
          response_format: {
          type: "json_object",
},
        }),
      }
    );

    if (!response.ok) {
  const errorBody = await response.text();
  throw new Error(
    `Groq API error ${response.status}: ${errorBody}`
  );
}

    const data = await response.json();

    const raw = data.choices?.[0]?.message?.content || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const aiDecision = JSON.parse(cleaned);

    const allowedActions = ["RETRY", "PAYMENT_LINK", "STOP"];

    const action = allowedActions.includes(aiDecision.action)
      ? aiDecision.action
      : "STOP";

    res.json({
      success: true,
      decision: {
        action,
        amount,
        explanation:
          aiDecision.explanation || "AI selected a recovery strategy.",
        guardrail: true,
        attempts,
        riskLevel: aiDecision.riskLevel || "LOW",
        aiPowered: true,
      },
    });
 } catch (error) {
  console.error("AI decision failed:", error);

  res.status(500).json({
    success: false,
    error: error.message,
  });
}
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
    paymentLink: "simulated",
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

     
    } catch (error) {
      console.error("Payment link creation failed:", error);

      res.status(500).json({
        success: false,
        message: "Payment link recovery failed safely.",
      });
    }
  });
  app.post("/api/recovery/batch", async (req, res) => {
  try {
    const cases = [
      { customer: "Rahul", amount: 4999, reason: "payment_failed", attempts: 0 },
      { customer: "Priya", amount: 2499, reason: "checkout_abandoned", attempts: 0 },
      { customer: "Arjun", amount: 8999, reason: "payment_failed", attempts: 3 },
      { customer: "Sneha", amount: 6499, reason: "payment_failed", attempts: 0 },
      { customer: "Vikram", amount: 3999, reason: "payment_failed", attempts: 1 },
    ];

    const results = await Promise.all(
      cases.map(async (item) => {
        // Deterministic guardrails always win
        if (item.attempts >= 3) {
          return {
            ...item,
            action: "STOP",
            status: "Stopped",
            explanation: "Safety guardrail stopped recovery after repeated failures.",
            aiPowered: true,
          };
        }

        const prompt = `
You are RecoverAI, an AI payment-recovery agent.

Analyze this payment recovery case and choose the safest action.

Customer: ${item.customer}
Amount: ${item.amount}
Reason: ${item.reason}
Previous attempts: ${item.attempts}

Allowed actions:
- RETRY for a normal recoverable payment failure.
- PAYMENT_LINK when checkout was abandoned.
- STOP when recovery should not continue.

Return ONLY valid JSON:
{
  "action": "RETRY",
  "explanation": "short explanation",
  "riskLevel": "LOW"
}
`;

        try {
          const response = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
              },
              body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: [
                  {
                    role: "system",
                    content:
                      "You are a careful payment recovery decision engine. Return JSON only.",
                  },
                  {
                    role: "user",
                    content: prompt,
                  },
                ],
                temperature: 0.6,
                max_completion_tokens: 1024,
                reasoning_effort: "low",
                response_format: {
                  type: "json_object",
                },
              }),
            }
          );

          if (!response.ok) {
            throw new Error(`Groq API error: ${response.status}`);
          }

          const data = await response.json();

          const raw = data.choices?.[0]?.message?.content || "";
          const cleaned = raw.replace(/```json|```/g, "").trim();
          const aiDecision = JSON.parse(cleaned);

          const allowedActions = ["RETRY", "PAYMENT_LINK", "STOP"];

          const action = allowedActions.includes(aiDecision.action)
            ? aiDecision.action
            : "STOP";

          return {
            ...item,
            action,
            status: action === "STOP" ? "Stopped" : "Ready",
            explanation:
              aiDecision.explanation || "AI selected a recovery strategy.",
            riskLevel: aiDecision.riskLevel || "LOW",
            aiPowered: true,
          };
        } catch (error) {
          console.error(
            `AI batch decision failed for ${item.customer}:`,
            error.message
          );

          return {
            ...item,
            action: "STOP",
            status: "Stopped",
            explanation:
              "AI decision was unavailable, so the safety guardrail stopped recovery.",
            riskLevel: "HIGH",
            aiPowered: false,
          };
        }
      })
    );

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
  } catch (error) {
    console.error("Batch recovery failed:", error);

    res.status(500).json({
      success: false,
      message: "Batch recovery failed safely.",
    });
  }
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