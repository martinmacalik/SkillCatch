import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT ?? 3001;
app.listen(Number(PORT), () => {
  console.log(`admin-api running at http://localhost:${PORT}`);
});
