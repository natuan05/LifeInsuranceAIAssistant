import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateManualTicketDto {
  @ApiProperty({ description: 'Unique idempotency request ID' })
  @IsUUID()
  clientRequestId!: string;

  @ApiProperty({ description: 'Title of the ticket', maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @ApiProperty({ description: 'Detailed description of the issue', maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  description!: string;

  @ApiPropertyOptional({ description: 'Related policy ID' })
  @IsOptional()
  @IsUUID()
  policyId?: string;
}
