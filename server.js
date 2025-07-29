// server.js
import express from 'express';
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public')); // serve your HTML/JS/CSS in /public

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
