import { IsInt, IsOptional, IsString, IsUUID, MaxLength, MinLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTicketDraftDto {
  @ApiProperty({ description: 'Expected version of the draft for optimistic concurrency', minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiProperty({ description: 'Updated title of the draft ticket', maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @ApiProperty({ description: 'Updated description of the issue', maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  description!: string;

  @ApiPropertyOptional({ description: 'Related policy ID' })
  @IsOptional()
  @IsUUID()
  policyId?: string;
}
