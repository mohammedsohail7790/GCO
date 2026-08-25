-- DropIndex
DROP INDEX "AiGeneration_tenantId_conversationId_idx";

-- DropIndex
DROP INDEX "AiMemory_tenantId_conversationId_idx";

-- DropIndex
DROP INDEX "Message_tenantId_conversationId_idx";

-- DropIndex
DROP INDEX "Note_tenantId_conversationId_idx";

-- CreateIndex
CREATE INDEX "AiGeneration_conversationId_idx" ON "AiGeneration"("conversationId");

-- CreateIndex
CREATE INDEX "AiMemory_conversationId_idx" ON "AiMemory"("conversationId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Conversation_state_idx" ON "Conversation"("state");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Note_conversationId_idx" ON "Note"("conversationId");
