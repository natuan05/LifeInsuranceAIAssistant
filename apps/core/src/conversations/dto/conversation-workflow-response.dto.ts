import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationMetadataDto, InboxPageInfoDto } from './conversation-response.dto';
export class HandoffConsentResponseDto {
  @ApiProperty({ enum: ['handoff-v1'] }) textVersion!: string;
  @ApiProperty({ enum: ['ENTIRE_CUSTOMER_VISIBLE_CONVERSATION'] }) scope!: string;
  @ApiProperty() text!: string;
}
class StaffNameDto { @ApiProperty() fullName!: string; }
export class ChatSupportDto {
  @ApiProperty({ enum: ['AVAILABLE', 'UNASSIGNED', 'STAFF_UNAVAILABLE'] }) availability!: string;
  @ApiProperty() assignmentVersion!: number;
  @ApiProperty({ type: StaffNameDto, nullable: true }) staff!: StaffNameDto | null;
  @ApiProperty({ type: HandoffConsentResponseDto }) handoffConsent!: HandoffConsentResponseDto;
}
class CustomerActionsDto {
  @ApiProperty() readMessages!: boolean;
  @ApiProperty() send!: boolean;
  @ApiProperty() requestStaff!: boolean;
}
class CustomerRequestDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['PENDING', 'ACCEPTED', 'REVOKED'] }) state!: string;
  @ApiProperty({ format: 'date-time' }) requestedAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) acceptedAt!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) revokedAt!: string | null;
}
export class CustomerConversationItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() subject!: string;
  @ApiProperty({ enum: ['AI_ACTIVE', 'PENDING_HANDOFF', 'STAFF_ACTIVE'] }) status!: string;
  @ApiProperty({ enum: ['AI', 'DIRECT', 'REQUEST', 'TRANSFERRED', 'LEGACY_REVIEW'] }) entryType!: string;
  @ApiProperty({ format: 'date-time' }) activityAt!: string;
}
export class CustomerConversationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() subject!: string;
  @ApiProperty({ enum: ['AI_ACTIVE', 'PENDING_HANDOFF', 'STAFF_ACTIVE'] }) status!: string;
  @ApiProperty({ enum: ['AI', 'DIRECT', 'REQUEST', 'TRANSFERRED', 'LEGACY_REVIEW'] }) entryType!: string;
  @ApiProperty() controlVersion!: number;
  @ApiProperty({ enum: ['AVAILABLE', 'REVIEW_REQUIRED'] }) availability!: string;
  @ApiProperty({ type: StaffNameDto, nullable: true }) staff!: StaffNameDto | null;
  @ApiPropertyOptional({ type: CustomerRequestDto }) request?: CustomerRequestDto;
  @ApiProperty({ type: CustomerActionsDto }) allowedActions!: CustomerActionsDto;
}
export class CustomerConversationResponseDto {
  @ApiProperty({ type: CustomerConversationDto }) conversation!: CustomerConversationDto;
}
export class CreateConversationResponseDto extends CustomerConversationResponseDto {
  @ApiProperty() replayed!: boolean;
}
export class CustomerConversationsResponseDto {
  @ApiProperty({ type: [CustomerConversationItemDto] }) items!: CustomerConversationItemDto[];
  @ApiProperty({ type: InboxPageInfoDto }) pageInfo!: InboxPageInfoDto;
}
class HandoffSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['PENDING', 'ACCEPTED', 'REVOKED'] }) state!: string;
  @ApiProperty({ format: 'date-time' }) requestedAt!: string;
}
class ControlStateDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['AI_ACTIVE', 'PENDING_HANDOFF', 'STAFF_ACTIVE'] }) status!: string;
  @ApiProperty() controlVersion!: number;
}
export class HandoffResponseDto {
  @ApiProperty({ type: HandoffSummaryDto }) request!: HandoffSummaryDto;
  @ApiProperty({ type: ControlStateDto }) conversation!: ControlStateDto;
  @ApiProperty() replayed!: boolean;
}
export class AcceptResponseDto {
  @ApiProperty({ type: ConversationMetadataDto }) conversation!: ConversationMetadataDto;
  @ApiProperty() replayed!: boolean;
}
export class CommandReceiptDto {
  @ApiProperty({ enum: ['COMMITTED'] }) state!: string;
  @ApiProperty({ format: 'uuid' }) resourceId!: string;
  @ApiProperty({ format: 'uuid' }) conversationId!: string;
  @ApiProperty() controlVersion!: number;
}
class CitationDto {
  @ApiProperty({ format: 'uuid' }) documentId!: string;
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty({ minimum: 1 }) page!: number;
  @ApiProperty() label!: string;
}
class SenderDto { @ApiProperty() displayName!: string; }
export class TranscriptMessageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'Decimal bigint string, not Number.' }) sequence!: string;
  @ApiProperty({ enum: ['CUSTOMER', 'STAFF', 'AI_AGENT', 'SYSTEM'] }) senderType!: string;
  @ApiProperty({ type: SenderDto }) sender!: SenderDto;
  @ApiProperty() content!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: [CitationDto] }) citations!: CitationDto[];
}
class TranscriptPageInfoDto {
  @ApiProperty({ type: String, nullable: true }) beforeCursor!: string | null;
  @ApiProperty() afterCursor!: string;
  @ApiProperty() hasMoreBefore!: boolean;
  @ApiProperty() hasMoreAfter!: boolean;
}
export class TranscriptResponseDto {
  @ApiProperty({ type: [TranscriptMessageDto] }) items!: TranscriptMessageDto[];
  @ApiProperty({ type: TranscriptPageInfoDto }) pageInfo!: TranscriptPageInfoDto;
}
