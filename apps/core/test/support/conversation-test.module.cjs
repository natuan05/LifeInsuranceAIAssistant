require('reflect-metadata');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { DatabaseService } = require('../../dist/database/database.service');
const { AuthService } = require('../../dist/auth/services/auth.service');
const { PolicyService } = require('../../dist/policies/services/policy.service');
const { configureHttp } = require('../../dist/http/http-foundation');
const folder = '../../dist/conversations/';
const types = [
  ['ConversationAccessService', 'conversation-access'], ['ConversationCommandService', 'conversation-command'],
  ['ConversationMessageService', 'conversation-message'], ['ConversationRateLimitService', 'conversation-rate-limit'],
  ['StaffInboxService', 'staff-inbox'], ['ConversationSessionService', 'conversation-session'],
  ['ConversationEntryService', 'conversation-entry'], ['ConversationHandoffService', 'conversation-handoff'],
  ['ConversationTranscriptService', 'conversation-transcript'], ['ConversationSendingService', 'conversation-sending'], ['ConversationEventService', 'conversation-event'],
].map(([name, file]) => require(folder + 'services/' + file + '.service')[name]);
const controllers = [
  require('../../dist/notifications/notifications.controller').NotificationsController,
  require(folder + 'controllers/staff-inbox.controller').StaffInboxController,
  require(folder + 'controllers/staff-conversation.controller').StaffConversationController,
  require(folder + 'controllers/customer-conversation.controller').CustomerConversationController,
];
function conversationTestProviders(core) {
  return [require('../../dist/tickets/services/ticket-access.service').TicketAccessService, require('../../dist/notifications/notifications.service').NotificationsService, { provide: DatabaseService, useValue: { prisma: core } }, AuthService, ...types,
    { provide: PolicyService, inject: [DatabaseService, AuthService],
      useFactory: (database, auth) => new PolicyService(database, auth, {}) }];
}
async function createConversationTestApp(core, options = {}) {
  class TestModule {}
  Module({ controllers, providers: [...conversationTestProviders(core), ...(options.realtime ? [require('../../dist/realtime/realtime.service').RealtimeService] : [])] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  configureHttp(app, { origins: ['http://localhost:8080'], docsEnabled: true });
  await app.listen(0, '127.0.0.1');
  return app;
}
module.exports = { conversationTestProviders, createConversationTestApp };
