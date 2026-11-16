import { ticketUnicodePattern } from './ticket-content';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Matches, NotContains, IsString, IsUUID, MaxLength, MinLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTicketDraftDto {
  @ApiProperty({ description: 'Expected version of the draft for optimistic concurrency', minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiProperty({ description: 'Updated title of the draft ticket', maxLength: 255 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @NotContains('\0')
  @Matches(ticketUnicodePattern)
  title!: string;

  @ApiProperty({ description: 'Updated description of the issue', maxLength: 4000 })
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
  @IsUUID()
  policyId?: string | null;
}
