import { Global, Module } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { CustomerStorefrontAuthController } from './customer-storefront-auth.controller';
import { CustomerStorefrontAccountController } from './customer-storefront-account.controller';
import { CustomerAddressRepository, CustomerRepository, WishlistItemRepository } from './customer.repository';
import { CustomerService } from './customer.service';

/** `@Global()`: checkout and order creation both resolve/attach a customer from outside this module's request graph. */
@Global()
@Module({
  controllers: [CustomerController, CustomerStorefrontAuthController, CustomerStorefrontAccountController],
  providers: [CustomerRepository, CustomerAddressRepository, WishlistItemRepository, CustomerService],
  exports: [CustomerService, CustomerRepository],
})
export class CustomerModule {}
