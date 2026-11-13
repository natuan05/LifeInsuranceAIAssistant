import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export const ticketStatuses = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export class TicketQuery {
  @ApiPropertyOptional({ maxLength: 100, description: 'Literal case-insensitive Customer name/code or ticket code; not message or summary content.' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && !/\p{Cc}/u.test(value) ? value.trim() : value)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString() @MaxLength(100) @Matches(/^[^\p{Cc}]*$/u)
  search?: string;

  @ApiPropertyOptional({ enum: [...ticketStatuses] })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(ticketStatuses)
  status?: typeof ticketStatuses[number];

  @ApiPropertyOptional({ format: 'uuid', description: 'Narrowing filter, never grants access.' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.toLowerCase() : value)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(50)
  limit = 20;

  @ApiPropertyOptional({ maxLength: 2731, description: 'Opaque signed actor/query-bound cursor. Invalid after expiry or server restart; retry from the first page.' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString() @MaxLength(2731) @Matches(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  cursor?: string;
}
