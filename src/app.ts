import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { routes } from './routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// Rotas
app.use('/', routes);

// 404 simples
app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada' } }));

export default app;
