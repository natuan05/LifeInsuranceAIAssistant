import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class ProductDocumentsQuery {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(50)
  limit = 20;

  @ApiPropertyOptional({ maxLength: 2731, description: 'Opaque keyset bound to actor, role, product and limit.' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString() @MaxLength(2731) @Matches(/^[A-Za-z0-9_-]+$/)
  cursor?: string;
}

export class ProductDocumentDto {
  @ApiProperty({ format: 'uuid' }) documentId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ['PUBLIC'] }) accessScope!: 'PUBLIC';
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty() versionNumber!: string;
  @ApiProperty({ format: 'date-time' }) versionCreatedAt!: string;
}
export class ProductDocumentPageDto {
  @ApiProperty() hasMore!: boolean;
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class ProductDocumentsResponseDto {
  @ApiProperty({ type: [ProductDocumentDto] }) items!: ProductDocumentDto[];
  @ApiProperty({ type: ProductDocumentPageDto }) pageInfo!: ProductDocumentPageDto;
}
