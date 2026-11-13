import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { AcceptTicketDto } from './accept-ticket.dto';
import { ticketStatuses } from './ticket-query.dto';
export class UpdateTicketStatusDto extends AcceptTicketDto {
  @ApiProperty({ enum: ticketStatuses })
  @IsIn(ticketStatuses)
  status!: typeof ticketStatuses[number];
}
