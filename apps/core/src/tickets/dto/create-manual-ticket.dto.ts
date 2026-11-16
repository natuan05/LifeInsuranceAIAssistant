import { ticketUnicodePattern } from './ticket-content';
import { Transform } from 'class-transformer';
import { IsOptional, Matches, NotContains, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateManualTicketDto {
  @ApiProperty({ description: 'Unique idempotency request ID' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.toLowerCase() : value)
  @IsUUID()
  clientRequestId!: string;

  @ApiProperty({ description: 'Title of the ticket', maxLength: 255 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @NotContains('\0')
  @Matches(ticketUnicodePattern)
  title!: string;

  @ApiProperty({ description: 'Detailed description of the issue', maxLength: 4000 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @NotContains('\0')
  @Matches(ticketUnicodePattern)
  description!: string;

  @ApiPropertyOptional({ description: 'Related policy ID' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? (value.trim().toLowerCase() || null) : value)
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.toLowerCase() : value)
  @IsUUID()
  policyId?: string | null;
}
