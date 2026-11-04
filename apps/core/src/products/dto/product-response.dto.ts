import { ApiProperty } from '@nestjs/swagger';

export class ProductDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() productCode!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) summary!: string | null;
  @ApiProperty() isActive!: boolean;
}

export class ProductListResponseDto {
  @ApiProperty({ type: [ProductDto] }) items!: ProductDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class ProductDetailResponseDto {
  @ApiProperty({ type: ProductDto }) product!: ProductDto;
}
