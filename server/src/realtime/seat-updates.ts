import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env.js";

let publisher: ((eventId: string) => void) | undefined;

export function notifySeatChanges(eventId: string): void {
  publisher?.(eventId);
}

export function createRealtimeServer(server: HttpServer) {
  const io = new Server(server, { cors: { origin: env.clientUrl, credentials: true } });
  const notify = (eventId: string) => io.to(`event:${eventId}`).emit("seats-changed", { eventId });
  publisher = notify;
  io.on("connection", (socket) => {
    socket.on("join-event", (eventId: unknown, acknowledge?: (success: boolean) => void) => {
      if (typeof eventId !== "string" || !/^[a-f\d]{24}$/.test(eventId)) {
        if (typeof acknowledge === "function") acknowledge(false);
        return;
      }
      for (const room of socket.rooms) if (room.startsWith("event:")) void socket.leave(room);
      void socket.join(`event:${eventId}`);
      if (typeof acknowledge === "function") acknowledge(true);
    });
  });
  return { notify, close: (callback: () => void) => { if (publisher === notify) publisher = undefined; io.close(callback); } };
}
