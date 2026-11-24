ALTER TABLE business.conversation_command_receipts DROP CONSTRAINT command_operation;
ALTER TABLE business.conversation_command_receipts ADD CONSTRAINT command_operation
  CHECK (operation IN ('CREATE_AI','CREATE_DIRECT','REQUEST_HANDOFF','ACCEPT_HANDOFF','SEND_MESSAGE','SEND_COPILOT'));

-- Pre-feature rows without a source or owner remain inaccessible. Duplicate
-- complete keys must be reviewed before upgrading; never merge their history.
CREATE UNIQUE INDEX staff_copilot_owner_source
  ON business.conversations (assigned_staff_id, linked_context_conv_id)
  WHERE channel_type = 'STAFF_COPILOT'
    AND assigned_staff_id IS NOT NULL AND linked_context_conv_id IS NOT NULL;
