// backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const User = require('./models/User');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ Mongo Error:', err));

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Webhook route
app.post('/webhook', async (req, res) => {
  const message = req.body.Body?.trim();
  const phone = req.body.From;

  // Reset
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

  // Call GPT with function schema
  const response = await openai.chat.completions.create({
    model: 'gpt-4-0613',
    messages: [
      {
        role: 'system',
        content: `
You are Kayani Assistant, a respectful, warm Swahili-speaking advisor.
You're collecting 4 things from the user in ANY order:
1. issue (tatizo lake la nguvu za kiume)
2. age (umri wake)
3. pastTreatment (ameshawahi kutumia tiba?)
4. readyToPay (yuko tayari kutumia pesa kidogo kwa tiba bora?)

Respond in human Swahili, ask only what’s missing. When all 4 are ready, say the client QUALIFIED and give them this link:
https://wa.me/255655889126?text=Nataka+kujiunga+na+program+ya+nguvu+za+kiume
        `
      },
      {
        role: 'user',
        content: `User said: ${message}`
      }
    ],
    functions: [
      {
        name: "updateUserData",
        description: "Extracts user profile info from their message",
        parameters: {
          type: "object",
          properties: {
            issue: { type: "string", description: "Tatizo lake la nguvu za kiume" },
            age: { type: "string", description: "Umri wake" },
            pastTreatment: { type: "string", description: "Dawa au tiba aliyowahi kutumia" },
            readyToPay: { type: "string", description: "Kama yuko tayari kutumia pesa" }
          }
        }
      }
    ],
    function_call: "auto"
  });

  const reply = response.choices[0].message.content;
  const funcCall = response.choices[0].message.function_call;

  // Save bot reply
  user.messages.push({ fromUser: false, text: reply });

  // If GPT returned structured data, update the user profile
  if (funcCall?.name === "updateUserData") {
    const args = JSON.parse(funcCall.arguments);
    if (args.issue && !user.issue) user.issue = args.issue;
    if (args.age && !user.age) user.age = args.age;
    if (args.pastTreatment && !user.pastTreatment) user.pastTreatment = args.pastTreatment;
    if (args.readyToPay && !user.readyToPay) user.readyToPay = args.readyToPay;
  }

  await user.save();
  res.send(`<Response><Message>${reply}</Message></Response>`);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 GPT-powered Kayani Assistant running on port ${PORT}`));
