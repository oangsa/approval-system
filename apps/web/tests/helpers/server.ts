import { setupServer } from "msw/node";

// Add only handlers needed by a test, using server.use(...).
export const server = setupServer();
