import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerTicketSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() ticketCode!: string;
  @ApiProperty() title!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional() policyNumber?: string | null;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional() confirmedAt?: string | null;
}

export class CustomerTicketListResponseDto {
  @ApiProperty({ type: [CustomerTicketSummaryDto] }) items!: CustomerTicketSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class CustomerTicketDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() ticketCode!: string;
  @ApiProperty() title!: string;
  @ApiProperty() status!: string;
  @ApiProperty() version!: number;
  @ApiPropertyOptional() policyId?: string | null;
  @ApiPropertyOptional() policyNumber?: string | null;
  @ApiPropertyOptional() conversationId?: string | null;
  @ApiPropertyOptional() confirmedContent?: Record<string, unknown> | null;
  @ApiPropertyOptional() assignedStaff?: {
    id: string;
    fullName: string;
    department?: string | null;
  } | null;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional() confirmedAt?: string | null;
}

export class CustomerTicketDetailResponseDto {
  @ApiProperty({ type: CustomerTicketDetailDto }) ticket!: CustomerTicketDetailDto;
}
