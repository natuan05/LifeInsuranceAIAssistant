import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class AcceptTicketDto {
  @ApiProperty({ minimum: 0, maximum: 2147483646 })
  @IsInt() @Min(0) @Max(2147483646)
  expectedVersion!: number;
}
