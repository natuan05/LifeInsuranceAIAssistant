import { Equals, IsInt, IsNotEmpty, IsObject, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class TicketConfirmationPayloadDto {
  @ApiProperty({ example: true, enum: [true] })
  @Equals(true)
  confirmed!: boolean;

  @ApiProperty({ example: 'ticket-v1', enum: ['ticket-v1'] })
  @IsString()
  @IsNotEmpty()
  @Equals('ticket-v1')
  textVersion!: string;
}

export class ConfirmTicketDto {
  @ApiProperty({ description: 'Unique idempotency request ID' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.toLowerCase() : value)
  @IsUUID()
  clientRequestId!: string;

  @ApiProperty({ description: 'ID of the draft to confirm' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.toLowerCase() : value)
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
