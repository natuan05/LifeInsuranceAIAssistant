import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
const integer = ({ value }: { value: unknown }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
export class MessageQueryDto {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @Transform(integer) @IsInt() @Min(1) @Max(100) limit = 50;
  @ApiPropertyOptional({ description: 'Exclusive older-page cursor; cannot combine with after.' })
  @ValidateIf((_o, v: unknown) => v !== undefined) @IsString() @MaxLength(2731) @Matches(/^[A-Za-z0-9_-]+$/) before?: string;
  @ApiPropertyOptional({ description: 'Exclusive catch-up cursor; cannot combine with before.' })
  @ValidateIf((_o, v: unknown) => v !== undefined) @IsString() @MaxLength(2731) @Matches(/^[A-Za-z0-9_-]+$/) after?: string;
}
export class CustomerConversationsQuery {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Transform(integer) @IsInt() @Min(1) @Max(50) limit = 20;
  @ApiPropertyOptional() @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsString() @MaxLength(2731) @Matches(/^[A-Za-z0-9_-]+$/) cursor?: string;
}
