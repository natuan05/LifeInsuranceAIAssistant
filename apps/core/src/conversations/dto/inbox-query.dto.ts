import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import type { InboxFilter } from '../services/conversation-access.service';

const integer = ({ value }: { value: unknown }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
export class InboxConversationsQuery {
  @ApiPropertyOptional({ enum: ['all', 'requests', 'active'], default: 'all' })
  @IsIn(['all', 'requests', 'active'])
  filter: InboxFilter = 'all';

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @Transform(integer) @IsInt() @Min(1) @Max(50)
  limit: number = 10;

  @ApiPropertyOptional({ maxLength: 2731, description: 'Opaque keyset cursor bound to the actor, endpoint and query. Never grants access.' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString() @MaxLength(2731) @Matches(/^[A-Za-z0-9_-]+$/)
  cursor?: string;
}

export class InboxGroupsQuery extends InboxConversationsQuery {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Transform(integer) @IsInt() @Min(1) @Max(50)
  override limit = 20;

  @ApiPropertyOptional({ maxLength: 100, description: 'Trimmed literal substring of Customer name/code only; case-insensitive, accents preserved.' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString() @MaxLength(100) @Matches(/^[^\p{Cc}]*$/u)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Optional narrowing filter; never expands the Staff scope.' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  customerId?: string;
}
