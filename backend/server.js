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

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ Mongo Error:', err));

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Webhook route for WhatsApp
app.post('/webhook', async (req, res) => {
  const message = req.body.Body?.trim();
  const phone = req.body.From;

  // Handle "reset" or "anzisha upya"
if (message.toLowerCase().includes("reset") || message.toLowerCase().includes("anzisha upya")) {
  await User.deleteOne({ phone });
  return res.send(`<Response><Message>Tumeset kila kitu upya. Tuanzie mwanzo kabisa...\n\nSasa ndugu yangu. Tuongee wazi. Kuna tatizo kwenye tendo la ndoa? Unawahi kumwaga? Uume hausimami vizuri? Ama kuna lingine? Niambie kwa kifupi ili nikuelewe vizuri.</Message></Response>`);
}



  let user = await User.findOne({ phone });
  if (!user) user = new User({ phone });

  // Save message history
  user.messages.push({ fromUser: true, text: message });

  // Confusion handler (if user replies with "sijakuelewa", "una maanisha?", etc.)
  const confusionWords = ['sijakuelewa', 'una maanisha', 'nimechanganyikiwa', 'haieleweki'];
  const isConfused = confusionWords.some(word => message.toLowerCase().includes(word));

  if (isConfused) {
    const lastAsked = getNextQuestion(user);
    return res.send(`<Response><Message>${explain(lastAsked)}</Message></Response>`);
  }

  // Track progress
  if (!user.issue) user.issue = message;
  else if (!user.age && /\d+/.test(message)) user.age = message;
  else if (!user.pastTreatment) user.pastTreatment = message;
  else if (!user.readyToPay) user.readyToPay = message;

  await user.save();

  // If fully qualified, send GPT-4 message
  if (user.issue && user.age && user.pastTreatment && user.readyToPay) {
    const prompt = `
You are a helpful, warm, Swahili-speaking assistant named Kayani Assistant.
Use human-like language — casual, caring, and not too professional.
Avoid robotic phrases. Sound like a real person talking one-on-one.
User said:
- Tatizo: ${user.issue}
- Umri na ndoa: ${user.age}
- Ameshawahi tumia tiba: ${user.pastTreatment}
- Yuko tayari kutumia hela: ${user.readyToPay}

Based on that, if the answers show readiness, respond joyfully, like:

✅ "Asante ndugu yangu. Kwa maelezo haya, umequalify kujiunga na tiba yetu ya siku 7..."
👉 Toa kiungo hiki pia mwisho wa meseji: https://wa.me/255655889126?text=Nataka+kujiunga+na+program+ya+nguvu+za+kiume
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });

    const reply = completion.choices[0].message.content;
    user.messages.push({ fromUser: false, text: reply });
    await user.save();
    return res.send(`<Response><Message>${reply}</Message></Response>`);
  }

  // Otherwise, ask next question
  const next = getNextQuestion(user);
  res.send(`<Response><Message>${next}</Message></Response>`);
});

// Human-style flow questions
function getNextQuestion(user) {
  if (!user.issue) {
    return "Sasa ndugu yangu. Tuongee wazi. Kuna tatizo kwenye tendo la ndoa? Unawahi kumwaga? Uume hausimami vizuri? Ama kuna lingine? Niambie kwa kifupi ili nikuelewe vizuri.";
  }
  if (!user.age) {
    return "Umri wako ukoje kaka? Na hali yako ya maisha — umeoa, una mchumba au bado upo solo?";
  }
  if (!user.pastTreatment) {
    return "Na kabla hujanifikia, umeshawahi kujaribu dawa yoyote? Ya hospitali au hata za kienyeji?";
  }
  if (!user.readyToPay) {
    return "Na je, uko tayari kuwekeza kiasi kidogo kwa tiba yenye uhakika? Si hela kubwa, lakini ni tiba iliyopangwa kitaalamu.";
  }
  return "Asante kwa maelezo. Naitengeneza tiba yako sasa hivi...";
}

// Handle confused users
function explain(originalQuestion) {
  if (originalQuestion.includes("Umri wako")) {
    return "Namaanisha: una miaka mingapi? Na hali yako ya maisha — umeoa au bado hujafunga ndoa?";
  }
  if (originalQuestion.includes("kujaribu dawa yoyote")) {
    return "Yaani, umeshawahi kutumia dawa yoyote kuhusu tatizo lako — iwe ya hospitali au ya kienyeji?";
  }
  if (originalQuestion.includes("uwekeza kiasi kidogo")) {
    return "Namaanisha: je, uko tayari kutumia pesa kidogo kupata tiba ya kweli na ya uhakika?";
  }
  return "Samahani kaka. Hebu jaribu kuelezea tena kwa maneno yako ili nikuelewe vizuri.";
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Kayani Assistant (human version) running on port ${PORT}`));
