import { ConflictError } from '@ems/kernel';
import { CategoryService } from '../../src/modules/category/category.service';
import type { CategoryEntity } from '../../src/database/entities';

/**
 * `CategoryService.move()` re-prefixes a whole subtree in one statement and must refuse
 * to move a category under its own descendant — doing so would disconnect the subtree
 * the moment the prefix rewrite ran. Exercised against a mocked repository so this runs
 * without a database, unlike the full move/reparent behaviour which needs one (covered
 * in the integration suite).
 */
describe('CategoryService.move', () => {
  function makeCategory(overrides: Partial<CategoryEntity>): CategoryEntity {
    return {
      id: '1',
      publicId: 'cat_root',
      parentId: null,
      path: '/1/',
      depth: 0,
      ...overrides,
    } as CategoryEntity;
  }

  function makeService(repo: Record<string, jest.Mock>) {
    const cache = { invalidateMany: jest.fn() };
    return new CategoryService(repo as never, cache as never);
  }

  it('refuses to move a category under its own descendant', async () => {
    const parent = makeCategory({ id: '1', publicId: 'cat_parent', path: '/1/', depth: 0 });
    const child = makeCategory({ id: '2', publicId: 'cat_child', parentId: '1', path: '/1/2/', depth: 1 });

    const repo = {
      transaction: jest.fn((work: (r: unknown) => Promise<unknown>) =>
        work({
          findByPublicIdOrFail: jest.fn((publicId: string) =>
            publicId === parent.publicId ? Promise.resolve(parent) : Promise.resolve(child),
          ),
          reprefixSubtree: jest.fn(),
          save: jest.fn(),
        }),
      ),
    };

    const service = makeService(repo);

    // Moving `parent` to become a child of its own child is a cycle: the new parent's
    // path ('/1/2/') starts with the moved category's current path ('/1/'), which is
    // exactly the condition the guard checks.
    await expect(service.move(parent.publicId, child.publicId)).rejects.toThrow(ConflictError);
  });

  it('recomputes path and depth when moving under a valid new parent', async () => {
    const oldParent = makeCategory({ id: '1', publicId: 'cat_old', path: '/1/', depth: 0 });
    const newParent = makeCategory({ id: '3', publicId: 'cat_new', path: '/3/', depth: 0 });
    const moved = makeCategory({ id: '2', publicId: 'cat_moved', parentId: '1', path: '/1/2/', depth: 1 });

    const reprefixSubtree = jest.fn();
    const save = jest.fn();

    const repo = {
      transaction: jest.fn((work: (r: unknown) => Promise<unknown>) =>
        work({
          findByPublicIdOrFail: jest.fn((publicId: string) => {
            if (publicId === moved.publicId) return Promise.resolve(moved);
            if (publicId === newParent.publicId) return Promise.resolve(newParent);
            return Promise.resolve(oldParent);
          }),
          reprefixSubtree,
          save,
        }),
      ),
    };

    const service = makeService(repo);
    const result = await service.move(moved.publicId, newParent.publicId);

    // oldParent and newParent are both at depth 0, so the moved category's own depth
    // (1) does not change — only its ancestor chain does.
    expect(reprefixSubtree).toHaveBeenCalledWith('/1/2/', '/3/2/', 0);
    expect(result.path).toBe('/3/2/');
    expect(result.depth).toBe(1);
    expect(result.parentId).toBe('3');
  });
});
