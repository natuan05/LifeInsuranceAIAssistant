import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

const integer = ({ value }: { value: unknown }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
export class CustomerListQuery {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 100000 })
  @Transform(integer) @IsInt() @Min(1) @Max(100000)
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @Transform(integer) @IsInt() @Min(1) @Max(50)
  pageSize: number = 10;
}
