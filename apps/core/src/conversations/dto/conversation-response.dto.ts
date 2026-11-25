import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InboxCustomerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() accountCode!: string;
}
export class InboxPageInfoDto {
  @ApiProperty() hasMore!: boolean;
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class InboxGroupDto {
  @ApiProperty({ type: InboxCustomerDto }) customer!: InboxCustomerDto;
  @ApiProperty({ format: 'date-time' }) lastActivityAt!: string;
}
export class InboxConversationItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() subject!: string;
  @ApiProperty({ enum: ['AI_ACTIVE', 'PENDING_HANDOFF', 'STAFF_ACTIVE'] }) status!: 'AI_ACTIVE' | 'PENDING_HANDOFF' | 'STAFF_ACTIVE';
  @ApiProperty({ enum: ['AI', 'REQUEST', 'DIRECT', 'TRANSFERRED'] }) entryType!: 'AI' | 'REQUEST' | 'DIRECT' | 'TRANSFERRED';
  @ApiProperty({ format: 'date-time' }) activityAt!: string;
}
export class InboxGroupsResponseDto {
  @ApiProperty({ type: [InboxGroupDto] }) items!: InboxGroupDto[];
  @ApiProperty({ type: InboxPageInfoDto }) pageInfo!: InboxPageInfoDto;
}
export class InboxConversationsResponseDto {
  @ApiProperty({ type: [InboxConversationItemDto] }) items!: InboxConversationItemDto[];
  @ApiProperty({ type: InboxPageInfoDto }) pageInfo!: InboxPageInfoDto;
}
export class HandoffRequestMetadataDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) sharedReason!: string | null;
  @ApiProperty({ format: 'date-time' }) requestedAt!: string;
}
export class ConversationActionsDto {
  @ApiProperty() canView!: boolean;
  @ApiProperty() canAccept!: boolean;
  @ApiProperty() canTakeover!: boolean;
  @ApiProperty() canSend!: boolean;
}
export class ConversationMetadataDto extends InboxConversationItemDto {
  @ApiProperty({ type: InboxCustomerDto }) customer!: InboxCustomerDto;
  @ApiProperty({ minimum: 0 }) controlVersion!: number;
  @ApiPropertyOptional({ type: HandoffRequestMetadataDto }) request?: HandoffRequestMetadataDto;
  @ApiProperty({ type: ConversationActionsDto }) allowedActions!: ConversationActionsDto;
}
export class ConversationMetadataResponseDto {
  @ApiProperty({ type: ConversationMetadataDto }) conversation!: ConversationMetadataDto;
}
