import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ticketStatuses } from './ticket-query.dto';
const integer = ({ value }: { value: unknown }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
export class CustomerTicketQuery {
  @ApiPropertyOptional({ enum: ticketStatuses })
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsIn(ticketStatuses)
  status?: typeof ticketStatuses[number];
  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && !/\p{Cc}/u.test(value) ? value.trim() : value)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString() @MaxLength(100) @Matches(/^[^\p{Cc}]*$/u)
  search?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100000, default: 1 })
  @Transform(integer) @IsInt() @Min(1) @Max(100000) page = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @Transform(integer) @IsInt() @Min(1) @Max(50) pageSize = 10;
}
