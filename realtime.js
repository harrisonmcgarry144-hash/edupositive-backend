const jwt = require("jsonwebtoken");

module.exports = function attachSockets(io) {
  // Authenticate every socket connection via JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    try {
      const payload   = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId   = payload.sub;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;

    // ── Personal room (notifications, DMs, competition invites) ───────────────
    socket.join(`user:${userId}`);

    // ── Study group rooms ──────────────────────────────────────────────────────
    socket.on("join_group", (groupId) => {
      socket.join(`group:${groupId}`);
      socket.to(`group:${groupId}`).emit("user_joined_group", { userId });
    });

    socket.on("leave_group", (groupId) => {
      socket.leave(`group:${groupId}`);
      socket.to(`group:${groupId}`).emit("user_left_group", { userId });
    });

    // ── Group chat ─────────────────────────────────────────────────────────────
    socket.on("group_message", ({ groupId, content }) => {
      if (!groupId || !content?.trim()) return;
      const msg = { userId, content, timestamp: new Date().toISOString() };
      io.to(`group:${groupId}`).emit("group_message", msg);
    });

    // ── Competition rooms ──────────────────────────────────────────────────────
    socket.on("join_competition", (competitionId) => {
      socket.join(`comp:${competitionId}`);
    });

    // Broadcast answer events to the other competitor in real time
    socket.on("comp_answer", ({ competitionId, cardIndex, correct, score }) => {
      socket.to(`comp:${competitionId}`).emit("comp_opponent_update", {
        userId, cardIndex, correct, score,
      });
    });

    socket.on("comp_complete", ({ competitionId, finalScore }) => {
      io.to(`comp:${competitionId}`).emit("comp_finished", { userId, finalScore });
    });

    // ── Typing indicators (DMs) ───────────────────────────────────────────────
    socket.on("typing_start", (receiverId) => {
      io.to(`user:${receiverId}`).emit("typing_start", { from: userId });
    });
    socket.on("typing_stop", (receiverId) => {
      io.to(`user:${receiverId}`).emit("typing_stop", { from: userId });
    });

    // ── Presence ──────────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      io.emit("user_offline", { userId });
    });
  });
};
