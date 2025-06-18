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

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Webhook
app.post('/webhook', async (req, res) => {
  const message = req.body.Body?.trim();
  const phone = req.body.From;

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

  // Reset command
  if (message.toLowerCase().includes("reset") || message.toLowerCase().includes("anzisha upya")) {
    await User.deleteOne({ phone });
    return res.send(`<Response><Message>Tumeset kila kitu upya. Tuanzie mwanzo kabisa...\n\nSasa ndugu yangu. Tuongee wazi. Kuna tatizo kwenye tendo la ndoa? Unawahi kumwaga? Uume hausimami vizuri? Ama kuna lingine? Niambie kwa kifupi ili nikuelewe vizuri.</Message></Response>`);
  }

  // Save latest message
  user.messages.push({ fromUser: true, text: message });

  // 🧠 GPT Prompt
  const systemPrompt = `
You are Kayani Assistant, a warm, respectful, Swahili-speaking health consultant for men. 
You're having a WhatsApp conversation with a client about their sexual health challenge. 
Your job is to gently collect these 4 pieces of info (in any order):

1. Tatizo lake (e.g. kuwahi kumwaga, uume kushindwa kusimama, nk)
2. Umri wake na hali ya ndoa
3. Kama alishawahi kutumia tiba/dawa
4. Kama yuko tayari kutumia pesa kidogo kwa tiba ya uhakika

Here's what you already know about the client:
- Tatizo: ${user.issue || "haijajulikana"}
- Umri na ndoa: ${user.age || "haijajulikana"}
- Tiba aliyowahi kutumia: ${user.pastTreatment || "haijajulikana"}
- Utayari kutumia pesa: ${user.readyToPay || "haijajulikana"}

Client just said:
"${message}"

Your job is to:
- Understand what info this message contains
- Update the missing fields (mentally)
- Ask the next missing question
- If all 4 are collected, congratulate the client and say they've QUALIFIED
- Send this link at the end: https://wa.me/255655889126?text=Nataka+kujiunga+na+program+ya+nguvu+za+kiume

Talk like a real human, use natural Swahili, avoid sounding like a robot. Be warm and clear.
`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'system', content: systemPrompt }],
  });

  const reply = completion.choices[0].message.content;

  // Save bot reply to history
  user.messages.push({ fromUser: false, text: reply });

  // OPTIONAL: Store guessed values later if you want full AI memory (or use OpenAI functions)
  await user.save();

  return res.send(`<Response><Message>${reply}</Message></Response>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Kayani Assistant GPT-powered brain live on port ${PORT}`));
