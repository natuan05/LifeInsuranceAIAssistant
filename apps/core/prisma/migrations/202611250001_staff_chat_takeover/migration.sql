ALTER TABLE business.conversation_command_receipts DROP CONSTRAINT command_operation;
ALTER TABLE business.conversation_command_receipts ADD CONSTRAINT command_operation
  CHECK (operation IN ('CREATE_AI','CREATE_DIRECT','REQUEST_HANDOFF','ACCEPT_HANDOFF','TAKEOVER_CONVERSATION','SEND_MESSAGE','SEND_COPILOT'));
