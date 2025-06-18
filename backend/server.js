require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const User = require('./models/User');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ Mongo Error:', err));

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function schema
const qualificationFunction = {
  name: "updateUserProfile",
  description: "Extracts user qualification data from conversation",
  parameters: {
    type: "object",
    properties: {
      issue: { type: "string", description: "Tatizo la kiume kama kuwahi kumwaga, nk" },
      age: { type: "string", description: "Umri wake na hali ya ndoa (mf. 24, hajaoa)" },
      pastTreatment: { type: "string", description: "Ameshawahi kutumia tiba gani" },
      readyToPay: { type: "string", description: "Je, yuko tayari kutumia pesa kidogo kwa tiba" }
    }
  }
};

// Webhook
app.post('/webhook', async (req, res) => {
  const message = req.body.Body?.trim();
  const phone = req.body.From;

  // Reset flow
  if (message.toLowerCase().includes("reset") || message.toLowerCase().includes("anzisha upya")) {
    await User.deleteOne({ phone });
    return res.send(`<Response><Message>Tumeset kila kitu upya. Tuanzie mwanzo kabisa...\n\nSasa ndugu yangu. Tuongee wazi. Kuna tatizo kwenye tendo la ndoa? Unawahi kumwaga? Uume hausimami vizuri? Ama kuna lingine? Niambie kwa kifupi ili nikuelewe vizuri.</Message></Response>`);
  }

  // Find or create user
  let user = await User.findOne({ phone });
  if (!user) {
    user = new User({
      phone,
      issue: "",
      age: "",
      pastTreatment: "",
      readyToPay: "",
      messages: []
    });
  }

  user.messages.push({ fromUser: true, text: message });

  const systemPrompt = `
You are Kayani Assistant, a warm Swahili-speaking consultant.
You're chatting with a male client via WhatsApp to collect:
1. Tatizo lake la kiume
2. Umri na hali ya ndoa
3. Kama alishawahi kutumia tiba
4. Kama yuko tayari kutumia pesa kidogo kwa tiba bora

Be friendly, natural, and keep it flowing.

If all are collected, say they QUALIFY and include this link: 
https://wa.me/255655889126?text=Nataka+kujiunga+na+program+ya+nguvu+za+kiume

You will ALSO return the extracted data using the function tool below.
`;

  // Call GPT with function calling
  const completion = await openai.chat.completions.create({
    model: "gpt-4-0613",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ],
    functions: [qualificationFunction],
    function_call: "auto",
  });

  const reply = completion.choices[0];

  // 🧠 If GPT called the function, update user profile
  if (reply.finish_reason === "function_call") {
    const funcArgs = JSON.parse(reply.message.function_call.arguments);

    if (funcArgs.issue) user.issue = funcArgs.issue;
    if (funcArgs.age) user.age = funcArgs.age;
    if (funcArgs.pastTreatment) user.pastTreatment = funcArgs.pastTreatment;
    if (funcArgs.readyToPay) user.readyToPay = funcArgs.readyToPay;
  }

  // Get natural reply text
  const finalText = reply.message.content || "Asante kwa maelezo. Tuendelee...";

  user.messages.push({ fromUser: false, text: finalText });
  await user.save();

  return res.send(`<Response><Message>${finalText}</Message></Response>`);
});

// Port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Kayani Assistant with GPT Functions is LIVE on port ${PORT}`));
