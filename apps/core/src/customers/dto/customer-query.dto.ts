import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

const integer = ({ value }: { value: unknown }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
export class CustomerListQuery {
  @ApiPropertyOptional({ maxLength: 100, description: 'Literal case-insensitive search across assigned customer name/code/email/phone. Trimmed; empty means no filter.' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString() @MaxLength(100) @Matches(/^[^\p{Cc}]*$/u)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 100000 })
  @Transform(integer) @IsInt() @Min(1) @Max(100000)
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @Transform(integer) @IsInt() @Min(1) @Max(50)
  pageSize: number = 10;
}
