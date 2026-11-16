import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TicketDraftPayloadDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() conversationId!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty() state!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiPropertyOptional() policyId!: string | null;
  @ApiPropertyOptional() policyNumber?: string | null;
  @ApiProperty() expiresAt!: string;
  @ApiProperty() createdAt!: string;
}

export class TicketConfirmationPromptDto {
  @ApiProperty({ example: 'ticket-v1' }) textVersion!: string;
  @ApiProperty({ example: 'Tôi xác nhận yêu cầu hỗ trợ với nội dung trên.' }) text!: string;
}

export class TicketDraftResponseDto {
  @ApiProperty({ type: TicketDraftPayloadDto }) draft!: TicketDraftPayloadDto;
  @ApiProperty({ type: TicketConfirmationPromptDto }) confirmation!: TicketConfirmationPromptDto;
}
