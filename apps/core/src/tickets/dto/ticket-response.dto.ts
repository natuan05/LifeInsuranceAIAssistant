import { ApiProperty } from '@nestjs/swagger';
import { ticketStatuses } from './ticket-query.dto';

class TicketCustomerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() accountCode!: string;
}
class TicketItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() ticketCode!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ticketStatuses }) status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: TicketCustomerDto }) customer!: TicketCustomerDto;
}
class TicketPageDto {
  @ApiProperty() hasMore!: boolean;
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class TicketListResponseDto {
  @ApiProperty({ type: [TicketItemDto] }) items!: TicketItemDto[];
  @ApiProperty({ type: TicketPageDto }) pageInfo!: TicketPageDto;
}
class TicketPolicyDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() policyNumber!: string;
}
class TicketActionsDto {
  @ApiProperty() accept!: boolean;
  @ApiProperty({ type: [String], enum: ticketStatuses }) transitions!: string[];
}
class TicketChatLinkDto {
  @ApiProperty({ format: 'uuid' }) conversationId!: string;
  @ApiProperty({ enum: ['REQUEST_METADATA', 'TRANSCRIPT'] }) capability!: string;
  @ApiProperty() href!: string;
}
class TicketDetailDto extends TicketItemDto {
  @ApiProperty() version!: number;
  @ApiProperty({ type: TicketPolicyDto, nullable: true }) policy!: TicketPolicyDto | null;
  @ApiProperty({ format: 'date-time' }) confirmedAt!: string;
  @ApiProperty({ enum: ['LEGACY_UNVERIFIED'] }) confirmationSource!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Legacy rows have no immutable confirmation snapshot.' }) confirmedContent!: null;
  @ApiProperty({ type: String, nullable: true }) aiSummary!: string | null;
  @ApiProperty({ type: TicketActionsDto }) allowedActions!: TicketActionsDto;
  @ApiProperty({ type: TicketChatLinkDto, nullable: true }) chatLink!: TicketChatLinkDto | null;
}
export class TicketDetailResponseDto {
  @ApiProperty({ type: TicketDetailDto }) ticket!: TicketDetailDto;
}
