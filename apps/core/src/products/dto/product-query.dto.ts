import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const integer = ({ value }: { value: unknown }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export class ProductQuery {
  @ApiPropertyOptional({ maxLength: 100, description: 'Literal substring of product name or code; case-insensitive.' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional() @IsString() @MaxLength(100) @Matches(/^[^\p{Cc}]*$/u)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 100000 })
  @Transform(integer) @IsInt() @Min(1) @Max(100000)
  page = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @Transform(integer) @IsInt() @Min(1) @Max(50)
  pageSize = 10;
}
