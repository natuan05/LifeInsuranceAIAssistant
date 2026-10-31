import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISO8601, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class UpdateStaffProfileDto {
  @ApiProperty({ maxLength: 255 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(255) @Matches(/^[^\p{Cc}]+$/u)
  fullName!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Omit to retain; null to clear. Digits with optional leading +, 7–15 digits.' })
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString() @Matches(/^\+?[0-9]{7,15}$/)
  phone?: string | null;

  @ApiProperty({ description: 'updatedAt returned by GET /staff/me', format: 'date-time' })
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}
