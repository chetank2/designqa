import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { ENV } from './config/env';
import { logger } from './utils/logger';

// Routes
import testRouter from './routes/test';
import sessionRouter from './routes/session';
import extractRouter from './routes/extract';
import compareRouter from './routes/compare';

const app = express();

app.use(cors());
app.use(express.json());

// Log requests
app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info(`${req.method} ${req.url}`);
    next();
});

// Mount routes
app.use('/mcp', testRouter);
app.use('/mcp', sessionRouter);
app.use('/mcp', extractRouter);
app.use('/mcp', compareRouter);

app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy', version: '1.0.0' });
});

app.listen(ENV.PORT, () => {
    logger.info(`MCP Proxy Server running on port ${ENV.PORT}`);
    logger.info(`Environment: ${ENV.NODE_ENV}`);
    logger.info(`Target MCP URL: ${ENV.FIGMA_MCP_URL}`);
});
