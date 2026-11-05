import { ApiProperty } from '@nestjs/swagger';
class NotificationTargetDto {
  @ApiProperty({ enum: ['CONVERSATION', 'TICKET'] }) type!: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
}
class StaffNotificationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['HANDOFF_REQUESTED', 'TICKET_CREATED', 'TICKET_ACCEPTED', 'TICKET_STATUS_CHANGED'] }) kind!: string;
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
export class NotificationReadResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() isRead!: boolean;
}
