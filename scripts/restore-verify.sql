-- Read-only integrity and tenant-boundary checks for a RESTORED database (run by scripts/restore-drill.sh; safe on any copy).
-- Every row is "check name | violations"; a healthy restore shows 0 everywhere. Table names are the Prisma model names.
SELECT 'message_without_conversation' AS check, count(*) AS violations FROM "Message" m LEFT JOIN "Conversation" c ON c.id = m."conversationId" WHERE c.id IS NULL
UNION ALL SELECT 'message_tenant_differs_from_conversation', count(*) FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId" WHERE m."tenantId" <> c."tenantId"
UNION ALL SELECT 'assignment_tenant_differs_from_conversation', count(*) FROM "Assignment" a JOIN "Conversation" c ON c.id = a."conversationId" WHERE a."tenantId" <> c."tenantId"
UNION ALL SELECT 'assignment_operator_other_tenant_without_service', count(*) FROM "Assignment" a JOIN "Operator" o ON o.id = a."operatorId" WHERE o."tenantId" <> a."tenantId" AND NOT EXISTS (SELECT 1 FROM "OperatorService" s WHERE s."operatorId" = o.id AND s."tenantId" = a."tenantId")
UNION ALL SELECT 'usage_without_message', count(*) FROM "UsageRecord" u LEFT JOIN "Message" m ON m.id = u."messageId" WHERE m.id IS NULL
UNION ALL SELECT 'usage_tenant_differs_from_message', count(*) FROM "UsageRecord" u JOIN "Message" m ON m.id = u."messageId" WHERE u."tenantId" <> m."tenantId"
UNION ALL SELECT 'operator_without_user', count(*) FROM "Operator" o LEFT JOIN "User" u ON u.id = o."userId" WHERE u.id IS NULL
UNION ALL SELECT 'client_user_without_tenant', count(*) FROM "User" WHERE role = 'CLIENT' AND "tenantId" IS NULL
UNION ALL SELECT 'two_active_assignments_for_one_conversation', count(*) FROM (SELECT "conversationId" FROM "Assignment" WHERE status = 'ACTIVE' GROUP BY 1 HAVING count(*) > 1) x
UNION ALL SELECT 'conversation_current_assignment_not_active', count(*) FROM "Conversation" c JOIN "Assignment" a ON a.id = c."currentAssignmentId" WHERE a.status <> 'ACTIVE'
UNION ALL SELECT 'duplicate_outbound_external_message_ids', count(*) FROM (SELECT "tenantId", "externalMessageId", direction FROM "Message" WHERE "externalMessageId" IS NOT NULL GROUP BY 1,2,3 HAVING count(*) > 1) x
UNION ALL SELECT 'earning_line_without_message', count(*) FROM "OperatorEarningLine" l LEFT JOIN "Message" m ON m.id = l."messageId" WHERE m.id IS NULL
UNION ALL SELECT 'issued_invoice_without_number', count(*) FROM "Invoice" WHERE status IN ('ISSUED','PAID') AND number IS NULL
UNION ALL SELECT 'commission_without_lead', count(*) FROM "Commission" c LEFT JOIN "Lead" l ON l.id = c."leadId" WHERE l.id IS NULL
ORDER BY 1;
