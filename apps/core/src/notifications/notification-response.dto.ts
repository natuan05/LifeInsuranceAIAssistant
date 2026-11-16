import { ApiProperty } from '@nestjs/swagger';
class NotificationTargetDto {
  @ApiProperty({ enum: ['CONVERSATION', 'TICKET'] }) type!: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
}
class StaffNotificationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['HANDOFF_REQUESTED', 'TICKET_CREATED', 'TICKET_ACCEPTED', 'TICKET_STATUS_CHANGED', 'CUSTOMER_MESSAGE_UNREAD'] }) kind!: string;
  @ApiProperty({ description: 'Generic server title, never a private preview.' }) title!: string;
  @ApiProperty() isRead!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: NotificationTargetDto }) target!: NotificationTargetDto;
}
class NotificationPageDto {
  @ApiProperty() hasMore!: boolean;
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class StaffNotificationsResponseDto {
  @ApiProperty({ type: [StaffNotificationDto] }) items!: StaffNotificationDto[];
  @ApiProperty({ type: NotificationPageDto }) pageInfo!: NotificationPageDto;
}
export class CustomerNotificationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['STAFF_ACCEPTED_HANDOFF', 'SUPPORT_TICKET_CREATED', 'STAFF_MESSAGE_UNREAD'] }) kind!: string;
  @ApiProperty({ description: 'Generic safe title without PII.' }) title!: string;
  @ApiProperty({ required: false, nullable: true }) body?: string | null;
  @ApiProperty() isRead!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: NotificationTargetDto }) target!: NotificationTargetDto;
}
export class CustomerNotificationsResponseDto {
  @ApiProperty({ type: [CustomerNotificationDto] }) items!: CustomerNotificationDto[];
  @ApiProperty({ type: NotificationPageDto }) pageInfo!: NotificationPageDto;
}
export class NotificationReadAllResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() count!: number;
}
export class NotificationReadResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() isRead!: boolean;
}
