const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phone: { type: String, unique: true },
  issue: String,
  age: String,
  pastTreatment: String,
  readyToPay: String,
  messages: [
    {
      fromUser: Boolean,
      text: String,
      timestamp: { type: Date, default: Date.now },
    },
  ],
});

module.exports = mongoose.model('User', userSchema);
