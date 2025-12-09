export const logger = {
    info: (msg: string, meta?: any) => {
        console.log(`[INFO] ${msg}`, meta ? JSON.stringify(meta) : '');
    },
    error: (msg: string, error?: any) => {
        console.error(`[ERROR] ${msg}`, error ? error : '');
    },
    warn: (msg: string, meta?: any) => {
        console.warn(`[WARN] ${msg}`, meta ? JSON.stringify(meta) : '');
    },
    debug: (msg: string, meta?: any) => {
        if (process.env.NODE_ENV === 'development') {
            console.debug(`[DEBUG] ${msg}`, meta ? JSON.stringify(meta) : '');
        }
    }
};
