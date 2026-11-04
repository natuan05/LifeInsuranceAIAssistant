import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ProductController } from './controllers/product.controller';
import { ProductService } from './services/product.service';
import { PoliciesModule } from '../policies/policies.module';
import { ProductDocumentService } from './services/product-document.service';
import { ProductDocumentController } from './controllers/product-document.controller';

@Module({ imports: [AuthModule, DatabaseModule, PoliciesModule], controllers: [ProductController, ProductDocumentController], providers: [ProductService, ProductDocumentService] })
export class ProductsModule {}
