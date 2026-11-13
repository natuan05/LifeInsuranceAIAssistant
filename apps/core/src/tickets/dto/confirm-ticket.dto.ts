import { IsBoolean, IsInt, IsNotEmpty, IsObject, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class TicketConfirmationPayloadDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  confirmed!: boolean;

  @ApiProperty({ example: 'ticket-v1' })
  @IsString()
  @IsNotEmpty()
  textVersion!: string;
}

export class ConfirmTicketDto {
  @ApiProperty({ description: 'Unique idempotency request ID' })
  @IsUUID()
  clientRequestId!: string;

  @ApiProperty({ description: 'ID of the draft to confirm' })
  @IsUUID()
  draftId!: string;

  @ApiProperty({ description: 'Expected version of the draft', minimum: 1 })
  @IsInt()
  @Min(1)
  expectedDraftVersion!: number;

  @ApiProperty({ type: TicketConfirmationPayloadDto })
  @IsObject()
  @ValidateNested()
  @Type(() => TicketConfirmationPayloadDto)
  confirmation!: TicketConfirmationPayloadDto;
}
