import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { AgentRunStatus } from '../../generated/prisma/client';

export class CopilotQuestionDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() clientMessageId!: string;
  @ApiProperty({ maxLength: 4000 }) @IsString() content!: string;
}

export class CopilotHistoryQuery {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Transform(({ value }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(50) limit = 20;

  @ApiPropertyOptional({ description: 'Exclusive older-page cursor.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString() @MaxLength(2731) @Matches(/^[A-Za-z0-9_-]+$/) before?: string;
}

export class CopilotRunDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: AgentRunStatus }) status!: AgentRunStatus;
}

export class CopilotSendDto extends CopilotRunDto {
  @ApiProperty() replayed!: boolean;
}

class CopilotMessageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

class CopilotQuestionMessageDto extends CopilotMessageDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) clientMessageId!: string | null;
}

export class CopilotSourceLocationDto {
  @ApiPropertyOptional({ type: [Number], description: 'Page numbers in the retrieval source.' }) pages?: number[];
  @ApiPropertyOptional() clause?: string;
  @ApiPropertyOptional() anchor?: string;
}

class CopilotCitationDto {
  @ApiProperty({ format: 'uuid' }) documentId!: string;
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: CopilotSourceLocationDto, nullable: true }) sourceLocation!: CopilotSourceLocationDto | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) policyId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) productId!: string | null;
}

class CopilotAnswerDto extends CopilotMessageDto {
  @ApiProperty({ type: [CopilotCitationDto] }) citations!: CopilotCitationDto[];
}

class CopilotTurnDto extends CopilotRunDto {
  @ApiProperty({ type: CopilotQuestionMessageDto }) question!: CopilotQuestionMessageDto;
  @ApiProperty({ type: CopilotAnswerDto, nullable: true }) answer!: CopilotAnswerDto | null;
  @ApiProperty({ type: String, nullable: true }) sourceThroughSequence!: string | null;
}

export class CopilotHistoryDto {
  @ApiProperty({ type: [CopilotTurnDto] }) items!: CopilotTurnDto[];
  @ApiProperty({ type: String, nullable: true }) beforeCursor!: string | null;
  @ApiProperty({ type: CopilotRunDto, nullable: true }) activeRun!: CopilotRunDto | null;
}
